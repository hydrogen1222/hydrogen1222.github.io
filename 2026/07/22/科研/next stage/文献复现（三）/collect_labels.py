#!/usr/bin/env python3

from pathlib import Path
import sys

import dpdata

root = Path("03_label_590")
outcars = sorted(root.glob("task.*/OUTCAR"))

print(f"Found {len(outcars)} OUTCAR files")

if len(outcars) != 590:
    print("ERROR: Not all 590 OUTCAR files exist.", file=sys.stderr)
    sys.exit(1)

systems = dpdata.MultiSystems()
bad = []

for outcar in outcars:
    try:
        data = dpdata.LabeledSystem(
            str(outcar),
            fmt="vasp/outcar",
            type_map=["P", "S", "Ge", "Li"],
            convergence_check=True,
        )

        if data.get_nframes() != 1:
            bad.append((str(outcar), f"frames={data.get_nframes()}"))
            continue

        systems.append(data)

    except Exception as exc:
        bad.append((str(outcar), repr(exc)))

if bad:
    print(f"\nFailed or unconverged calculations: {len(bad)}")
    for path, reason in bad:
        print(path, reason)
    sys.exit(2)

systems.to_deepmd_npy("04_data_init")

print("\nSuccessfully converted all 590 labels.")
print(systems)
