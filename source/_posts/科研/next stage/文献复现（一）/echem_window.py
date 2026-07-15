#!/usr/bin/env python3
"""
Electrochemical stability window of Li6PS5Cl (the 2nd pillar of
Deng/Zhu/Chu/Ong, Chem. Mater. 2017, 29, 281-288).

Opens the composition to Li, sweeps the Li chemical potential mu_Li
(<-> voltage vs Li/Li+), and reports the voltage range over which
Li6PS5Cl is stable, plus what it reduces / oxidizes into at the edges.
Saves a publication-quality window figure (PNG + PDF).

The shared data recipe (entry loading, MP pull, phase diagram, Li profile)
lives in lpsc_common.py; this script owns only the window figure.

Example
-------
python echem_window.py \
  --api-key "$MP_API_KEY" \
  --vasprun /home/storm/Paper/MP/vasprun.xml \
  --out-prefix echem_window_LPSC

Test without mp-api/pymatgen/network
------------------------------------
python echem_window.py --self-test
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Optional

import lpsc_common as lc


def build_window(args: argparse.Namespace) -> tuple[list[lc.Plateau], Optional[tuple[float, float]], dict[str, Any]]:
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
    print(f"[info] competitor entries kept : {len(competitors)}")

    pd_full = lc.build_phase_diagram(stack, competitors + [my_entry])

    # Phase-stability context (helps judge whether the window reproduces Deng).
    try:
        ehull, decomp = lc.compute_ehull(stack, competitors, my_entry)
        print(f"[phase] E_above_hull vs competitors = {1000 * ehull:+.1f} meV/atom")
        if ehull <= args.zero_tol:
            print(
                "[warn] Target on/inside the hull: the 'stable' window below is Li6PS5Cl\n"
                "       itself, not the neutral decomposition Deng 2017 assumes (metastable)."
            )
    except Exception as exc:
        print(f"[warn] Ehull calculation failed, continuing: {exc}")

    profile = lc.get_li_profile(stack, pd_full, open_el, target)
    plateaus = lc.make_plateaus(profile, xmax=args.xmax)

    print(f"\n{'V vs Li/Li+':>12} | {'Li uptake':>9} | {'kind':>6} | products")
    print("-" * 90)
    for p in plateaus:
        kind = "neut" if p.is_neutral(args.zero_tol) else ("Li-in" if p.uptake > 0 else "Li-out")
        print(f"{lc.fmt_float(p.left_v, 3):>12} | {lc.fmt_float(p.uptake, 3):>9} | {kind:>6} | {p.products}")

    win = lc.find_zero_window(plateaus, tol=args.zero_tol)
    metadata = {
        "target": target.reduced_formula,
        "open_element": open_el.symbol,
        "chemsys": chemsys,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "competitors_kept": len(competitors),
        "window": list(win) if win else None,
    }
    return plateaus, win, metadata


def edge_products(plateaus: list[lc.Plateau], win: Optional[tuple[float, float]], args: argparse.Namespace) -> tuple[str, str, Optional[float], Optional[float]]:
    """Products just below (reduction) and just above (oxidation) the window."""
    if not win:
        return "(no stable window)", "(no stable window)", None, None
    lo, hi = win
    # The neutral plateau itself; its neighbours carry the redox products.
    idx = next((i for i, p in enumerate(plateaus) if abs(p.left_v - lo) < 1e-6), None)
    source = lambda p: (p.products_with_li if args.show_li else p.products)
    red = source(plateaus[idx - 1]) if idx is not None and idx > 0 else "(stable vs Li metal)"
    oxi = source(plateaus[idx + 1]) if idx is not None and idx + 1 < len(plateaus) else "(none in range)"
    return red, oxi, lo, hi


def plot_window(
    stack: dict[str, Any],
    plateaus: list[lc.Plateau],
    win: Optional[tuple[float, float]],
    red: str,
    oxi: str,
    metadata: dict[str, Any],
    args: argparse.Namespace,
    png_path: Path,
    pdf_path: Path,
) -> None:
    """Render the electrochemical stability window as a banded figure."""
    plt = stack["plt"]
    lc.set_nature_rcparams(plt)

    xmax = args.xmax
    fig, ax = plt.subplots(figsize=(7.2, 2.2))
    fig.subplots_adjust(left=0.07, right=0.97, top=0.88, bottom=0.22)

    if win:
        lo, hi = win
        ax.axvspan(0, lo, color="#e74c3c", alpha=0.18)
        ax.axvspan(lo, hi, color="#2ecc71", alpha=0.30)
        ax.axvspan(hi, xmax, color="#3498db", alpha=0.18)
        for x in (lo, hi):
            ax.axvline(x, color="k", ls="--", lw=0.8)
            ax.text(x, 1.06, f"{x:.2f} V", ha="center", va="bottom", fontsize=8)
        ax.text((lo + hi) / 2, 0.5, f"{lc.latex_formula(metadata['target'])}\nstable\n({hi - lo:.2f} V)",
                ha="center", va="center", fontsize=9, weight="bold")
        ax.text(lo / 2, 0.5, f"reduced\n{red}", ha="center", va="center", fontsize=7.5)
        ax.text((hi + xmax) / 2, 0.5, f"oxidized\n{oxi}", ha="center", va="center", fontsize=7.5)
    else:
        ax.text(xmax / 2, 0.5, "no intrinsic-stability plateau found", ha="center", va="center", fontsize=9)

    ax.set_xlim(0, xmax)
    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.set_xlabel(r"Voltage vs Li/Li$^+$ (V)")
    if args.title:
        ax.set_title(args.title, pad=6)
    lc.style_axes(ax)
    # y-axis spines/ticks are meaningless on a banded strip figure.
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(left=False)

    fig.savefig(png_path, dpi=args.dpi, bbox_inches="tight", pad_inches=0.03)
    fig.savefig(pdf_path, bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)


def save_outputs(args: argparse.Namespace, plateaus: list[lc.Plateau], win: Optional[tuple[float, float]], metadata: dict[str, Any]) -> None:
    stack = lc.import_runtime_stack()
    out_prefix = Path(args.out_prefix).expanduser()
    out_prefix.parent.mkdir(parents=True, exist_ok=True)

    red, oxi, lo, hi = edge_products(plateaus, win, args)
    if win:
        print("\n" + "=" * 72)
        print(f"Electrochemical window of {metadata['target']}:  {lo:.2f} - {hi:.2f} V (width {hi - lo:.2f} V)")
        print(f"  reduced below {lo:.2f} V  ->  {red}")
        print(f"  oxidized above {hi:.2f} V ->  {oxi}")
        print("=" * 72)
    else:
        print("\nNo intrinsic-stability plateau found; read the full profile above.")

    png_path = out_prefix.with_suffix(".png")
    pdf_path = out_prefix.with_suffix(".pdf")
    plot_window(stack, plateaus, win, red, oxi, metadata, args, png_path, pdf_path)
    print(f"\n[saved] {png_path}")
    print(f"[saved] {pdf_path}")


def self_test() -> None:
    lc.run_self_test()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Electrochemical stability window of Li6PS5Cl (Deng 2017, Pillar 2) using MP entries + your vasprun.xml."
    )
    lc.add_common_args(p)
    p.add_argument("--open-element", default=lc.DEFAULT_OPEN_ELEMENT, help="Open element, default Li.")
    p.add_argument("--out-prefix", default="echem_window_LPSC", help="Output prefix for PNG/PDF.")
    p.add_argument("--xmax", type=float, default=4.0, help="Maximum x-axis voltage.")
    p.add_argument("--show-li", action="store_true", help="Include free Li in the redox product labels (oxidation edge).")
    p.add_argument("--dpi", type=int, default=600, help="PNG dpi.")
    p.add_argument("--title", default=None, help="Custom plot title.")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    plateaus, win, metadata = build_window(args)
    save_outputs(args, plateaus, win, metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
