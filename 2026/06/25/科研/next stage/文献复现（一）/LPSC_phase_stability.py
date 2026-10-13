#!/usr/bin/env python3
"""
Li6PS5Cl phase stability on the Li-P-S-Cl convex hull.

Reproduces the 'phase stability' pillar of Deng/Zhu/Chu/Ong,
Chem. Mater. 2017, 29, 281-288 (DOI: 10.1021/acs.chemmater.6b02648),
using Materials Project entries + your own VASP relaxation.

The shared data recipe lives in lpsc_common.py; this script reports
E_above_hull and the decomposition products, and optionally writes a JSON
summary. Verified against mp-api 0.46.4 / pymatgen 2026.5.4.

Example
-------
python phase_stability.py \
  --api-key "$MP_API_KEY" \
  --vasprun /home/storm/Paper/MP/vasprun.xml \
  --out-prefix phase_stability_LPSC
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Optional

import lpsc_common as lc


def run(args: argparse.Namespace) -> dict[str, Any]:
    vasprun_path = Path(args.vasprun).expanduser()
    if not vasprun_path.exists():
        lc.die(f"vasprun.xml not found: {vasprun_path}")
    api_key = lc.resolve_api_key(args)

    stack = lc.import_runtime_stack()
    Composition = stack["Composition"]
    target = Composition(args.target)
    chemsys = lc.chemsys_of(target)

    print(f"[info] target          : {target.reduced_formula}")
    print(f"[info] chemical system : {'-'.join(chemsys)}")
    print(f"[info] vasprun         : {vasprun_path}")

    # 1) Pull ALL phases in the chemsys. CRITICAL: force GGA/GGA+U only -- the
    #    default mixes in r2SCAN entries, and you must NOT put r2SCAN and PBE
    #    energies on the same hull. compatible_only=True applies MP2020
    #    corrections (incl. the S anion correction sulfides need).
    thermo_types = lc.parse_thermo_types(args.thermo_types)
    mp_entries = lc.pull_mp_entries(stack, api_key, chemsys, thermo_types)
    mp_target, competitors = lc.split_target_competitors(mp_entries, target.reduced_formula)
    print(f"Pulled {len(mp_entries)} MP entries ({', '.join(thermo_types)}, corrected)")
    print(f"  -> {len(mp_target)} MP {target.reduced_formula} entrie(s) split off; "
          f"{len(competitors)} competitor phases kept for the decomposition hull")

    # 2) Your relaxed structure as an MP-compatible entry.
    my = lc.load_my_entry(stack, vasprun_path, target.reduced_formula)

    # 3a) SANITY CHECK: does your VASP energy reproduce MP's Li6PS5Cl?
    #     Formation energy is intrinsic to an entry given the elemental refs,
    #     so a single PD containing everything gives comparable numbers. If
    #     |Delta| >> a few tens of meV/atom, your INCAR/POTCARs are NOT
    #     MP-compatible and the Ehull below is meaningless -- re-relax with
    #     MPRelaxSet.
    sanity: dict[str, Any] = {}
    pd_ref = lc.build_phase_diagram(stack, competitors + mp_target + [my])
    e_mine = pd_ref.get_form_energy_per_atom(my)
    if mp_target:
        best_mp = min(mp_target, key=lambda e: e.energy_per_atom)
        e_mp = pd_ref.get_form_energy_per_atom(best_mp)
        delta_mev = 1000 * (e_mine - e_mp)
        sanity = {
            "my_form_e_per_atom": e_mine,
            "mp_best_form_e_per_atom": e_mp,
            "delta_mev_per_atom": delta_mev,
            "mp_best_entry_id": str(best_mp.entry_id),
        }
        print(f"\n[sanity] E_form/atom   MP: {e_mp:+.4f} eV   "
              f"yours: {e_mine:+.4f} eV   Delta = {delta_mev:+.1f} meV/atom")
    else:
        print(f"\n[sanity] no MP {target.reduced_formula} to compare against; yours E_form/atom = {e_mine:+.4f} eV")

    # 3b) PHYSICAL RESULT: energy of YOUR phase above the hull of competing
    #     phases. Hull is built WITHOUT any target-formula phase, so this is
    #     the true decomposition energy.
    ehull, decomp = lc.compute_ehull(stack, competitors, my)
    print(f"\nE_above_hull (your {target.reduced_formula}) = {1000 * ehull:+.1f} meV/atom")
    print("  (>0 = metastable by this much;  <0 = more stable than MP's known phases)")
    print("Decomposes into:")
    for d in decomp:
        print(f"  {d['amount']:7.4f}  x  {d['formula']:12s}  ({d['entry_id']})")

    return {
        "target": target.reduced_formula,
        "chemsys": chemsys,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "mp_entries_pulled": len(mp_entries),
        "competitors_kept": len(competitors),
        "sanity": sanity,
        "ehull_mev_per_atom": 1000 * ehull,
        "decomposition": decomp,
    }


def self_test() -> None:
    lc.run_self_test()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Li6PS5Cl phase stability (E_above_hull + decomposition) on the Li-P-S-Cl hull. Deng 2017, Pillar 1."
    )
    lc.add_common_args(p)
    p.add_argument("--out-prefix", default=None, help="If set, write a JSON summary to <prefix>.json.")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    summary = run(args)
    if args.out_prefix:
        out = Path(args.out_prefix).expanduser().with_suffix(".json")
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"\n[saved] {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())