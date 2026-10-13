#!/usr/bin/env python3
"""Fetch all Materials Project structure candidates in the Li-Ge-P-S system.

Only structures, provenance, symmetry, and magnetic screening metadata are
requested.  MP energies and stability fields are intentionally not used, so
this script does not filter the candidate set by the MP convex hull.

The API key is read from the ``MP_API_KEY`` environment variable.  The
script never prompts for, prints, or stores the API key.

Example
-------
    export MP_API_KEY='...'
    python scripts/fetch_mp_structures.py

Dependencies: ``mp-api`` and ``pymatgen``.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
import platform
import re
import sys
from datetime import date
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any


ELEMENTS = ("Li", "Ge", "P", "S")
MP_API_KEY_ENV = "MP_API_KEY"
STRUCTURE_FIELDS = (
    "material_id",
    "formula_pretty",
    "chemsys",
    "structure",
    "symmetry",
    "theoretical",
    "is_magnetic",
    "ordering",
    "total_magnetization",
    "total_magnetization_normalized_formula_units",
    "num_magnetic_sites",
    "types_of_magnetic_species",
)


def package_version(package_name: str) -> str | None:
    """Return an installed package version without importing the package."""

    try:
        return version(package_name)
    except PackageNotFoundError:
        return None


def safe_name(text: str) -> str:
    """Make a value safe for use as one path component."""

    value = re.sub(r"[^A-Za-z0-9_.+-]+", "_", text).strip("._")
    return value or "unknown"


def structure_hash(structure: Any) -> str:
    """Hash the serialized structure for file-level duplicate detection."""

    payload = structure.as_dict()
    raw = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def symmetry_metadata(symmetry: Any) -> dict[str, Any] | None:
    """Extract JSON-serializable symmetry metadata from a SummaryDoc."""

    if symmetry is None:
        return None

    return {
        "symbol": getattr(symmetry, "symbol", None),
        "number": getattr(symmetry, "number", None),
    }


def subsystem_combinations() -> list[tuple[str, ...]]:
    """Return all 15 non-empty element subsets in deterministic order."""

    return [
        subset
        for n_elements in range(1, len(ELEMENTS) + 1)
        for subset in itertools.combinations(ELEMENTS, n_elements)
    ]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch Materials Project structures for every non-empty "
            "Li-Ge-P-S chemical subsystem."
        )
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("snapshots"),
        help="Root directory for snapshots (default: snapshots).",
    )
    parser.add_argument(
        "--snapshot-dir",
        type=Path,
        default=None,
        help=(
            "Explicit snapshot directory. If omitted, use "
            "mp_<date>_<database-version> below --output-root."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    api_key = os.environ.get(MP_API_KEY_ENV)
    if not api_key:
        print(
            f"Required environment variable {MP_API_KEY_ENV} is not set.",
            file=sys.stderr,
        )
        return 2

    try:
        from mp_api.client import MPRester
    except ImportError as exc:
        print(
            "Missing dependency: install mp-api and pymatgen before running "
            "this script.",
            file=sys.stderr,
        )
        print(f"Details: {exc}", file=sys.stderr)
        return 2

    # Passing the key directly avoids any interactive prompt.  It is never
    # included in the manifest or in any status message.
    with MPRester(api_key=api_key) as mpr:
        database_version = str(mpr.get_database_version())
        if args.snapshot_dir is None:
            snapshot_dir = (
                args.output_root
                / f"mp_{date.today().isoformat()}_{safe_name(database_version)}"
            )
        else:
            snapshot_dir = args.snapshot_dir

        raw_dir = snapshot_dir / "raw_structures"
        disorder_dir = snapshot_dir / "quarantine" / "disordered"
        raw_dir.mkdir(parents=True, exist_ok=True)
        disorder_dir.mkdir(parents=True, exist_ok=True)

        records: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        query_log: list[dict[str, Any]] = []
        seen_material_ids: set[str] = set()
        allowed_elements = set(ELEMENTS)

        for subset in subsystem_combinations():
            chemsys = "-".join(subset)
            expected_elements = set(subset)
            docs = list(
                mpr.materials.summary.search(
                    chemsys=chemsys,
                    fields=list(STRUCTURE_FIELDS),
                )
            )
            query_log.append(
                {
                    "chemsys": chemsys,
                    "n_returned": len(docs),
                }
            )

            for doc in docs:
                mp_id = str(getattr(doc, "material_id", ""))
                if not mp_id or mp_id in seen_material_ids:
                    continue
                seen_material_ids.add(mp_id)

                structure = getattr(doc, "structure", None)
                if structure is None:
                    skipped.append(
                        {
                            "source_id": mp_id,
                            "queried_chemsys": chemsys,
                            "reason": "missing_structure",
                        }
                    )
                    continue

                structure_elements = {
                    str(element) for element in structure.composition.elements
                }
                if not structure_elements <= allowed_elements:
                    skipped.append(
                        {
                            "source_id": mp_id,
                            "queried_chemsys": chemsys,
                            "reason": "element_outside_requested_system",
                            "elements": sorted(structure_elements),
                        }
                    )
                    continue
                if structure_elements != expected_elements:
                    skipped.append(
                        {
                            "source_id": mp_id,
                            "queried_chemsys": chemsys,
                            "reason": "chemsys_mismatch",
                            "elements": sorted(structure_elements),
                        }
                    )
                    continue

                is_ordered = bool(structure.is_ordered)
                formula = structure.composition.reduced_formula
                filename = f"{mp_id}__{safe_name(formula)}.cif"
                target_dir = raw_dir if is_ordered else disorder_dir
                target_path = target_dir / filename
                structure.to(filename=str(target_path), fmt="cif")

                records.append(
                    {
                        "source": "Materials Project",
                        "source_id": mp_id,
                        "source_database_version": database_version,
                        "queried_chemsys": chemsys,
                        "formula_pretty": getattr(doc, "formula_pretty", None),
                        "reduced_formula": formula,
                        "n_sites": len(structure),
                        "is_ordered": is_ordered,
                        "theoretical": getattr(doc, "theoretical", None),
                        "magnetism": {
                            "is_magnetic": getattr(doc, "is_magnetic", None),
                            "ordering": (
                                str(getattr(doc, "ordering"))
                                if getattr(doc, "ordering", None) is not None
                                else None
                            ),
                            "total_magnetization": getattr(
                                doc, "total_magnetization", None
                            ),
                            "total_magnetization_per_formula_unit": getattr(
                                doc,
                                "total_magnetization_normalized_formula_units",
                                None,
                            ),
                            "num_magnetic_sites": getattr(
                                doc, "num_magnetic_sites", None
                            ),
                            "types_of_magnetic_species": [
                                str(value)
                                for value in (
                                    getattr(doc, "types_of_magnetic_species", None)
                                    or []
                                )
                            ],
                        },
                        "symmetry": symmetry_metadata(
                            getattr(doc, "symmetry", None)
                        ),
                        "structure_sha256": structure_hash(structure),
                        "structure_file": str(target_path.relative_to(snapshot_dir)),
                    }
                )

        records.sort(key=lambda record: record["source_id"])
        skipped.sort(key=lambda record: record["source_id"])
        manifest = {
            "schema_version": 1,
            "source": "Materials Project",
            "elements": list(ELEMENTS),
            "chemical_subsystems": ["-".join(x) for x in subsystem_combinations()],
            "database_version": database_version,
            "query_date": date.today().isoformat(),
            "api_client_version": package_version("mp-api"),
            "pymatgen_version": package_version("pymatgen"),
            "python_version": platform.python_version(),
            "requested_fields": list(STRUCTURE_FIELDS),
            "selection_policy": {
                "uses_mp_energy": False,
                "filters_by_mp_stability": False,
                "disordered_structures": "quarantine/disordered",
            },
            "n_records": len(records),
            "n_skipped": len(skipped),
            "queries": query_log,
            "records": records,
            "skipped": skipped,
        }

        manifest_path = snapshot_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(f"Saved snapshot to: {snapshot_dir}")
    print(f"Saved structures: {len(records)}")
    print(f"Quarantined/skipped records: {len(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
