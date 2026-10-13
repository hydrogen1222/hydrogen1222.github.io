#!/usr/bin/env python3

from pathlib import Path
import sys

from pymatgen.io.vasp.outputs import Eigenval


def main() -> None:
    eigenval_path = Path(sys.argv[1] if len(sys.argv) > 1 else "EIGENVAL")

    if not eigenval_path.is_file():
        raise FileNotFoundError(f"找不到文件：{eigenval_path}")

    # occu_tol 用于判断某条带是否被占据。
    # 对普通绝缘体通常足够；若使用较大展宽，需检查占据数。
    eigenval = Eigenval(
        eigenval_path,
        occu_tol=1e-5,
        separate_spins=False,
    )

    gap, cbm, vbm, is_direct = eigenval.eigenvalue_band_properties

    print(f"EIGENVAL       : {eigenval_path}")
    print(f"NELECT         : {eigenval.nelect}")
    print(f"NKPTS          : {eigenval.nkpt}")
    print(f"NBANDS         : {eigenval.nbands}")
    print(f"VBM            : {vbm:.8f} eV")
    print(f"CBM            : {cbm:.8f} eV")
    print(f"sampled gap    : {gap:.8f} eV")
    print(f"sampled direct : {is_direct}")

    print("\n注意：这是 EIGENVAL 所含 k 点中的带隙，")
    print("并不自动保证是真正的全布里渊区基本带隙。")


if __name__ == "__main__":
    main()
