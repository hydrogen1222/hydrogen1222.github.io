#!/usr/bin/env python3
"""LGPS (Li10GeP2S12) stability on the Ge-Li-P-S convex hull.

The Materials Project competitor entries and the user's VASP result are both
restricted to an MP2020-compatible PBE GGA/GGA+U energy scheme.  All MP entries
with the target stoichiometry are excluded when evaluating decomposition, so a
negative result means the user's structure lies below the known competitor hull.

Example
-------
export MP_API_KEY="your-key"
python3 LGPS_phase_stability.py \
  --vasprun conf_033711/vasprun.xml \
  --out-prefix phase_stability_LGPS
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Optional

import phase_stability_common as common


def run(args: argparse.Namespace) -> dict[str, Any]:
    vasprun_path = Path(args.vasprun).expanduser().resolve()
    if not vasprun_path.is_file():
        common.die(f"vasprun.xml not found: {vasprun_path}")

    stack = common.import_runtime_stack()
    Composition = stack["Composition"]
    try:
        target = Composition(args.target)
    except Exception as exc:
        common.die(f"invalid target composition {args.target!r}: {exc}")

    chemsys = common.chemsys_of(target)
    target_label = args.target.replace(" ", "")
    thermo_types = common.parse_thermo_types(args.thermo_types)
    api_key = common.resolve_api_key(args)

    print(f"[info] target          : {target_label}")
    print(f"[info] chemical system : {'-'.join(chemsys)}")
    print(f"[info] vasprun         : {vasprun_path}")

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

    mine = common.load_my_entry(stack, vasprun_path, target)

    sanity: dict[str, Any] = {}
    reference_pd = common.build_phase_diagram(
        stack, competitors + mp_target + [mine]
    )
    my_formation = float(reference_pd.get_form_energy_per_atom(mine))
    if mp_target:
        best_mp = min(mp_target, key=lambda entry: entry.energy_per_atom)
        mp_formation = float(reference_pd.get_form_energy_per_atom(best_mp))
        delta_mev = 1000.0 * (my_formation - mp_formation)
        sanity = {
            "my_formation_energy_ev_per_atom": my_formation,
            "mp_formation_energy_ev_per_atom": mp_formation,
            "delta_mev_per_atom": delta_mev,
            "mp_entry_id": str(best_mp.entry_id),
        }
        print(
            f"\n[sanity] formation energy/atom: MP {mp_formation:+.6f} eV, "
            f"yours {my_formation:+.6f} eV, delta {delta_mev:+.1f} meV/atom"
        )
    else:
        print(
            f"\n[sanity] MP has no {target_label} entry; "
            f"your formation energy is {my_formation:+.6f} eV/atom"
        )

    ehull, decomposition = common.compute_ehull(stack, competitors, mine)
    print(f"\nE_above_hull (your {target_label}) = {1000.0 * ehull:+.1f} meV/atom")
    print("  positive: metastable; negative: below the known competitor hull")
    print("Decomposition products:")
    for product in decomposition:
        print(
            f"  {product['amount']:7.4f} x "
            f"{product['formula']:14s} ({product['entry_id']})"
        )

    return {
        "target": target_label,
        "pymatgen_reduced_formula": target.reduced_formula,
        "chemical_system": chemsys,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "mp_entries_pulled": len(mp_entries),
        "mp_target_entries_removed": len(mp_target),
        "competitors_retained": len(competitors),
        "sanity": sanity,
        "ehull_mev_per_atom": 1000.0 * ehull,
        "decomposition": decomposition,
    }


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "LGPS Li10GeP2S12 phase stability "
            "(E_above_hull and decomposition) on the Ge-Li-P-S hull."
        )
    )
    common.add_common_args(parser)
    parser.add_argument(
        "--out-prefix",
        default=None,
        help="Write the summary to <prefix>.json.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        common.run_self_test()
        return 0

    summary = run(args)
    if args.out_prefix:
        output = Path(args.out_prefix).expanduser().with_suffix(".json")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2, ensure_ascii=False)
        print(f"\n[saved] {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
